/*
 * Filename: C03001.c
 * Description: Calculates sums using functions: check
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <stdbool.h>

int check(int n)
{
    int sum = 0;
    while (n > 0)
    {
        sum += n % 10;
        n /= 10;
    }
    if (sum % 10 == 0)
        return 1;
    else
        return 0;
}

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    for (int t = 1; t <= T; t++)
    {
        int n;
        scanf("%d", &n); // Read input
        if (check(n))
            printf("YES\n"); // Print result
        else
            printf("NO\n"); // Print result
    }
    return 0;
}