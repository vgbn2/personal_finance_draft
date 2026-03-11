/*
 * Filename: C01026.c
 * Description: C Program using functions: snt
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <math.h>

int snt(int n)
{
    if (n <= 1)
        return 0;
    for (int i = 2; i <= sqrt(n); i++)
        if (n % i == 0)
            return 0;
    return 1;
}

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    while (T--)
    {
        int n;
        scanf("%d", &n); // Read input
        if (snt(n) == 1)
            printf("YES\n"); // Print result
        else
            printf("NO\n"); // Print result
    }
    return 0;
}