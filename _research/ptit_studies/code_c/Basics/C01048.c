/*
 * Filename: C01048.c
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
    int n;
    scanf("%d", &n); // Read input
    int even = 0, odd = 0, t;
    while (n > 0)
    {
        t = n % 10;
        if (t % 2 == 0)
            even++;
        else
            odd++;
        n /= 10;
    }
    printf("%d %d", odd, even); // Print result
    return 0;
}