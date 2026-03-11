/*
 * Filename: C04012.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Entry point
int main()
{
    long long n;
    scanf("%lld", &n); // Read input
    long long a[n];
    long long b[100005] = {0};
    for (long long i = 0; i < n; i++)
    {
        scanf("%lld", &a[i]); // Read input
        b[a[i]]++;
    }
    for (long long i = 0; i < n; i++)
        if (b[a[i]] > 1)
        {
            printf("%lld ", a[i]); // Print result
            b[a[i]] = 0;
        }
    return 0;
}