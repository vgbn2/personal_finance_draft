/*
 * Filename: C04017.c
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
    int n, dem = 0, a[100];
    scanf("%d", &n); // Read input
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        if (snt(a[i]) != 0)
            dem++;
        else
            a[i] = 0;
    }
    printf("%d", dem); // Print result
    for (int i = 0; i < n; i++)
        if (a[i] != 0)
            printf(" %d", a[i]); // Print result
    return 0;
}